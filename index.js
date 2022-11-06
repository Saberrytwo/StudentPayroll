const express = require('express')
const cors = require('cors')
const bodyParser = require("body-parser");
const app = express()
const port = 3001

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const knex = require('knex')({
  client: 'mysql2',
  connection: {
    host : 'classproject.cluster-cbdo9oytyewz.us-east-2.rds.amazonaws.com',
    port : 3306,
    user : 'admin',
    password : 'admin123',
    database : 'studentemploymentdb'
  }
});

app.get('/', (req, res) => {
  res.send({
    code: 200,
    health: "Healthy"
  })
});

app.get('/get-table-data', async (req, res) => {
  const supervisors = await knex('Supervisor');
  const positions = await knex('Position');
  const years = await knex('EmployeeSemesterPositionLink').distinct().pluck('year');

  var supervisorsWithEmployees = await Promise.all(supervisors.map(async el => {
    return knex('EmployeeSemesterPositionLink')
      .join('Position', 'Position.id', 'EmployeeSemesterPositionLink.positionId')
      .join('Employee', 'Employee.byuId', 'EmployeeSemesterPositionLink.employeeId')
      .join('EmployeePayInfo', 'EmployeeSemesterPositionLink.payRateId', 'EmployeePayInfo.id')
      .join('Semester', 'Semester.id', 'EmployeeSemesterPositionLink.semesterId')
      .where('supervisorId', el.id)
      .where('semester', req.query.semester)
      .where('year', req.query.year).then(employees => {
      return {
        supervisor: {
          id: el.id,
          firstName: el.firstName,
          lastName: el.lastName
        },
        employees: employees
      }
    })
  }));

  const response = 
  { 
    positions: positions, 
    years: years.sort(function(a, b) {
    return b - a;
    }), 
    supervisors: supervisorsWithEmployees 
  }

  res.send(response);
});

app.get('/get-report-data', async (req, res) => {
  const employees = await knex('Employee')
    .join('EmployeeSemesterPositionLink', 'Employee.byuId', 'EmployeeSemesterPositionLink.employeeId');
  const taCount = employees.filter(emp => emp.position === 1).length;
  const raCount = employees.filter(emp => emp.position === 2).length;
  
  const positions = await knex('Position');
  const genders = await knex('Employee').distinct().pluck('gender');

  const overallWageAvg = await knex('EmployeePayInfo').avg('payRate as avg');
  const positionalAvg = await Promise.all(positions.map(async pos => {
    const avg = await knex('EmployeePayInfo').join('EmployeeSemesterPositionLink', 'EmployeeSemesterPositionLink.payRateId', 'EmployeePayInfo.id').avg('payRate as avg').where('positionId', pos.id)

    return ({[pos.position]: avg[0].avg})
  }));

  const overallCount= employees.length;
  const positionalCount = await Promise.all(positions.map(async pos => {
    const count = await knex('Employee').join('EmployeeSemesterPositionLink', 'EmployeeSemesterPositionLink.employeeId', 'Employee.byuId').count().where('positionId', pos.id)

    return ({[pos.position]: count[0]['count(*)']})
  }));

  const genderRatioDatasets = genders.map(gender => {
    return {
      label: gender,
      data: positions.map(pos => employees.filter(emp => emp.position == pos.id && emp.gender == gender)).length,
      backgroundColor: gender == 'female' ? 'rgba(255, 99, 132, 0.5)' : gender == 'male' ? 'rgba(53, 162, 235, 0.5)' : 'rgba(133, 133, 133, 0.75)',
    }
  })

  const reportsData = {
    wageData: {
      overallAvg: overallWageAvg[0].avg,
      positionalAvg: positionalAvg
    },
    employeeCountData: {
      overallCount: overallCount,
      positionalCount: positionalCount
    },
    taRaData: {
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'TA vs RA',
          },
        },
      },
      data: {
        labels: ['TA\'s', 'RA\'s'],
        datasets: [
          {
            data: [taCount, raCount],
            backgroundColor: 'rgba(39, 245, 159, 0.5)',
          }
        ]
      }
    },
    genderRatioData: {
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Gender Ratio',
          },
        },
      },
      data: {
        labels: positions.map(pos => pos.position),
        datasets: genderRatioDatasets
      }
    }
  }

  res.send(reportsData);
});

app.post('/update-row', (req, res) => {
  knex('EmployeeSemesterPositionLink')
      .join('Employee', 'Employee.byuId', 'EmployeeSemesterPositionLink.employeeId')
      .join('EmployeePayInfo', 'Employee.byuId', 'EmployeePayInfo.employeeId')
  .where('byuId', req.body.byuId)
  .update({
    [req.body.column]: req.body.value
  }).then(result => { res.status(200); res.send(); })
});

app.post('/add-employee-data', async (req, res) => {
  console.log('ADDDING')
  knex('Employee')
  .insert({
    byuId: req.body.byuId,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    isInternational: req.body.isInternational,
    gender: req.body.gender,
    byuName: req.body.byuName,
    email: req.body.email,
    expectedHours: req.body.expectedHours,
    phone: req.body.phone,
    hireDate: req.body.hireDate,
    nameChangeCompleted: req.body.nameChangeCompleted,
    isPayingGradTuition: req.body.isPayingGradTuition,
    notes: req.body.notes,
  })
  .then(response => {
    knex('EmployeePayInfo')
    .insert({
      payRate: req.body.payRate
    }, ['id'])
    .then(async resp => {
      var semester = await knex('Semester').where('semester', req.body.semester).pluck('id');
      knex('EmployeeSemesterPositionLink')
      .insert({
        employeeId: req.body.byuId,
        supervisorId: req.body.supervisorId,
        semesterId: semester,
        year: req.body.year,
        positionId: req.body.position,
        payRateId: resp[0]
      }, '').then(response => {
        res.status(200).send({ 'status': 'ok' });
      })
    })
  })
})

app.post('/delete/:id', async (req, res) => {
  knex('EmployeeSemesterPositionLink')
    .join('Employee', 'Employee.byuId', 'EmployeeSemesterPositionLink.employeeId')
    .join('EmployeePayInfo', 'EmployeeSemesterPositionLink.payRateId', 'EmployeePayInfo.id')
  .where('byuId', req.params['id'])
  .del().then(result => {
    res.status(200).send({ 'status': 'ok' });
  })
})

app.listen(port, () => {
  console.log(`App listening on port ${port}`)
})